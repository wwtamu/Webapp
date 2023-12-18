package com.project.model;

import javax.persistence.Column;
import javax.persistence.Entity;

@Entity
public class Language extends BaseEntity {

    @Column(unique = true, nullable = false)
    private String name;
    
    public Language() { }
    
    /**
     * 
     * @param name
     */
    public Language(String name) {
        this.name = name;
    }

    /**
     * 
     * @return
     */
    public String getName() {
        return name;
    }

    /**
     * 
     * @param name
     */
    public void setName(String name) {
        this.name = name;
    }
    
}

